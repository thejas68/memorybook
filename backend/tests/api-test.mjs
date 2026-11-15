// MemoryBook API test — run with:  node api-test.mjs [baseUrl]
// Needs Node 18+. Creates throwaway users/books (emails end in @test.memorybook.local).
// Default base URL is the LOCAL backend. Never point this at production.
const BASE = process.argv[2] || 'http://localhost:5000';
if (/onrender\.com|vercel\.app/.test(BASE)) {
  console.error('Refusing to run against a deployed URL:', BASE);
  process.exit(2);
}

const stamp = Date.now();
let pass = 0, fail = 0;
const failures = [];

const call = async (method, path, token, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
};

const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name} ${extra}`); }
};

const register = async (label) => {
  const email = `${label}-${stamp}@test.memorybook.local`;
  const r = await call('POST', '/api/auth/register', null,
    { email, password: 'password123', displayName: `User ${label}` });
  if (r.status !== 201) throw new Error(`register ${label} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return { email, token: r.data.token, id: r.data.user.id };
};

(async () => {
  console.log(`Testing ${BASE}\n`);
  const owner = await register('owner');
  const contrib = await register('contrib');
  const viewer = await register('viewer');
  const outsider = await register('outsider');

  // --- books + membership
  const bookA = (await call('POST', '/api/books', owner.token, { title: 'Book A', theme: 'classic' })).data;
  const bookB = (await call('POST', '/api/books', outsider.token, { title: 'Book B (outsider owns)', theme: 'travel' })).data;
  await call('POST', `/api/books/${bookA.id}/members`, owner.token, { email: contrib.email, role: 'contributor' });
  await call('POST', `/api/books/${bookA.id}/members`, owner.token, { email: viewer.email, role: 'viewer' });

  console.log('Creating pages');
  const p1 = await call('POST', `/api/books/${bookA.id}/pages`, contrib.token, { title: 'First', content: { text: 'hello' } });
  check('contributor can create a page (201)', p1.status === 201, `got ${p1.status}`);
  const p2 = await call('POST', `/api/books/${bookA.id}/pages`, owner.token, { title: 'Second', content: { text: 'world' } });
  check('owner can create a page (201)', p2.status === 201, `got ${p2.status}`);
  check('page numbers are sequential (1 then 2)', p1.data?.pageNumber === 1 && p2.data?.pageNumber === 2,
    `got ${p1.data?.pageNumber}, ${p2.data?.pageNumber}`);
  check('create response includes author display name', p1.data?.author?.profile?.displayName === 'User contrib',
    `got ${JSON.stringify(p1.data?.author)}`);
  const vCreate = await call('POST', `/api/books/${bookA.id}/pages`, viewer.token, { title: 'Sneaky', content: { text: 'x' } });
  check('viewer CANNOT create a page (403)', vCreate.status === 403, `got ${vCreate.status}`);
  const oCreate = await call('POST', `/api/books/${bookA.id}/pages`, outsider.token, { title: 'Sneaky', content: { text: 'x' } });
  check('non-member CANNOT create a page (403)', oCreate.status === 403, `got ${oCreate.status}`);

  console.log('Reading pages');
  const list = await call('GET', `/api/books/${bookA.id}/pages`, viewer.token);
  check('viewer can read pages (200)', list.status === 200 && Array.isArray(list.data) && list.data.length === 2, `got ${list.status}`);
  check('pages come back in page-number order', list.data?.[0]?.title === 'First' && list.data?.[1]?.title === 'Second');
  check('page list includes author names', list.data?.[0]?.author?.profile?.displayName === 'User contrib');
  check('page list includes a reactions array', Array.isArray(list.data?.[0]?.reactions));
  const oRead = await call('GET', `/api/books/${bookA.id}/pages`, outsider.token);
  check('non-member CANNOT read pages (403)', oRead.status === 403, `got ${oRead.status}`);

  const contribPage = p1.data.id;   // authored by contributor
  const ownerPage = p2.data.id;     // authored by owner

  console.log('Editing pages');
  const oEdit = await call('PATCH', `/api/books/${bookA.id}/pages/${contribPage}`, outsider.token, { title: 'HACKED' });
  check('non-member CANNOT edit a page (403)', oEdit.status === 403, `got ${oEdit.status}`);
  const vEdit = await call('PATCH', `/api/books/${bookA.id}/pages/${contribPage}`, viewer.token, { title: 'HACKED' });
  check('viewer CANNOT edit a page (403)', vEdit.status === 403, `got ${vEdit.status}`);
  const cEditOther = await call('PATCH', `/api/books/${bookA.id}/pages/${ownerPage}`, contrib.token, { title: 'HACKED' });
  check("contributor CANNOT edit someone else's page (403)", cEditOther.status === 403, `got ${cEditOther.status}`);
  const ownerEditOther = await call('PATCH', `/api/books/${bookA.id}/pages/${contribPage}`, owner.token, { title: 'HACKED' });
  check("owner CANNOT rewrite a contributor's page (403, owner may only delete)", ownerEditOther.status === 403, `got ${ownerEditOther.status}`);
  const cEditOwn = await call('PATCH', `/api/books/${bookA.id}/pages/${contribPage}`, contrib.token, { title: 'First (edited)' });
  check('author CAN edit their own page (200)', cEditOwn.status === 200 && cEditOwn.data?.title === 'First (edited)', `got ${cEditOwn.status}`);

  console.log('Cross-book access');
  // outsider owns Book B, so passes the role check for B, but the page belongs to Book A
  const crossEdit = await call('PATCH', `/api/books/${bookB.id}/pages/${ownerPage}`, outsider.token, { title: 'HACKED' });
  check("cannot edit Book A's page through Book B's URL (404)", crossEdit.status === 404, `got ${crossEdit.status}`);
  const crossDel = await call('DELETE', `/api/books/${bookB.id}/pages/${ownerPage}`, outsider.token);
  check("cannot delete Book A's page through Book B's URL (404)", crossDel.status === 404, `got ${crossDel.status}`);
  const stillThere = await call('GET', `/api/books/${bookA.id}/pages`, owner.token);
  check("owner's page survived the cross-book attempts", stillThere.data?.some?.((p) => p.id === ownerPage && p.title === 'Second'));

  console.log('Validation');
  const noTitle = await call('POST', `/api/books/${bookA.id}/pages`, owner.token, { title: '   ', content: { text: 'x' } });
  check('blank title rejected (400)', noTitle.status === 400, `got ${noTitle.status}`);
  check('validation error is a readable string, not an object', typeof noTitle.data?.error === 'string', `got ${JSON.stringify(noTitle.data)}`);
  const huge = await call('POST', `/api/books/${bookA.id}/pages`, owner.token, { title: 'Big', content: { text: 'a'.repeat(60000) } });
  check('oversized page text rejected (400/413)', huge.status === 400 || huge.status === 413, `got ${huge.status}`);

  console.log('Reactions');
  const r1 = await call('POST', '/api/reactions', viewer.token, { pageId: contribPage, emoji: '❤️' });
  check('viewer (a member) can react (201)', r1.status === 201, `got ${r1.status}`);
  const r1b = await call('POST', '/api/reactions', viewer.token, { pageId: contribPage, emoji: '❤️' });
  check('reacting twice is idempotent', r1b.status === 201 && r1b.data?.id === r1.data?.id);
  const rOut = await call('POST', '/api/reactions', outsider.token, { pageId: contribPage, emoji: '❤️' });
  check('non-member CANNOT react (403)', rOut.status === 403, `got ${rOut.status}`);
  const rBad = await call('POST', '/api/reactions', viewer.token, { pageId: 'not-a-uuid', emoji: '❤️' });
  check('bad reaction input gives a string error', rBad.status === 400 && typeof rBad.data?.error === 'string', `got ${JSON.stringify(rBad.data)}`);
  const after = await call('GET', `/api/books/${bookA.id}/pages`, owner.token);
  const pg = after.data?.find?.((p) => p.id === contribPage);
  check('REACTIONS PERSIST: page list includes the reaction after "refresh"',
    pg?.reactions?.length === 1 && pg.reactions[0].emoji === '❤️' && pg.reactions[0].userId === viewer.id,
    `got ${JSON.stringify(pg?.reactions)}`);
  const rmOther = await call('DELETE', `/api/reactions/${r1.data?.id}`, owner.token);
  check("cannot remove someone else's reaction (403)", rmOther.status === 403, `got ${rmOther.status}`);
  const rmOwn = await call('DELETE', `/api/reactions/${r1.data?.id}`, viewer.token);
  check('can remove own reaction (200)', rmOwn.status === 200, `got ${rmOwn.status}`);
  const after2 = await call('GET', `/api/books/${bookA.id}/pages`, owner.token);
  check('reaction is gone after removal', after2.data?.find?.((p) => p.id === contribPage)?.reactions?.length === 0);

  console.log('Deleting pages');
  const vDel = await call('DELETE', `/api/books/${bookA.id}/pages/${contribPage}`, viewer.token);
  check('viewer CANNOT delete a page (403)', vDel.status === 403, `got ${vDel.status}`);
  const oDel = await call('DELETE', `/api/books/${bookA.id}/pages/${contribPage}`, outsider.token);
  check('non-member CANNOT delete a page (403)', oDel.status === 403, `got ${oDel.status}`);
  const cDelOther = await call('DELETE', `/api/books/${bookA.id}/pages/${ownerPage}`, contrib.token);
  check("contributor CANNOT delete someone else's page (403)", cDelOther.status === 403, `got ${cDelOther.status}`);
  const ownerDel = await call('DELETE', `/api/books/${bookA.id}/pages/${contribPage}`, owner.token);
  check("owner CAN delete a contributor's page (200)", ownerDel.status === 200, `got ${ownerDel.status}`);
  const cDelOwn = await call('DELETE', `/api/books/${bookA.id}/pages/${ownerPage}`, owner.token);
  check('author CAN delete their own page (200)', cDelOwn.status === 200, `got ${cDelOwn.status}`);
  const gone = await call('DELETE', `/api/books/${bookA.id}/pages/${ownerPage}`, owner.token);
  check('deleting a missing page gives 404, not 500', gone.status === 404, `got ${gone.status}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch((e) => { console.error('Test run crashed:', e.message); process.exit(3); });
