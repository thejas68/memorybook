import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Plus, Users, Calendar, Search, LogOut, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '../contexts/AuthContext';
import { booksApi } from '../lib/api';

const themeColors: Record<string, string> = {
  travel: 'bg-accent/20 border-accent/40',
  family: 'bg-warm-gold/20 border-warm-gold/40',
  friendship: 'bg-primary/10 border-primary/30',
  romantic: 'bg-destructive/10 border-destructive/30',
  classic: 'bg-muted/40 border-muted',
};

const themeEmoji: Record<string, string> = {
  travel: '🌍',
  family: '👨‍👩‍👧‍👦',
  friendship: '🎓',
  romantic: '💕',
  classic: '📖',
};

const Dashboard = () => {
  const [search, setSearch] = useState('');
  const [books, setBooks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTheme, setNewTheme] = useState('classic');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Separate error states — no more shared error bleeding between dialogs
  const [createError, setCreateError] = useState('');
  const [renameError, setRenameError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // Rename state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingBook, setRenamingBook] = useState<any>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBook, setDeletingBook] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const data = await booksApi.getAll();
        setBooks(data);
      } catch (err: any) {
        setCreateError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchBooks();
  }, []);

  // Helper: only show ⋯ menu for books the logged-in user owns
  const isOwner = (book: any): boolean => {
    return book.members?.some(
      (m: any) => m.userId === user?.id && m.role === 'owner'
    );
  };

  const handleCreateBook = async () => {
    if (!newTitle.trim()) return;
    setIsCreating(true);
    try {
      const book = await booksApi.create(newTitle, undefined, newTheme);
      setBooks((prev) => [book, ...prev]);
      setNewTitle('');
      setNewTheme('classic');
      setDialogOpen(false);
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const openRenameDialog = (book: any) => {
    setRenamingBook(book);
    setRenameTitle(book.title);
    setRenameError('');
    setRenameDialogOpen(true);
  };

  const handleRename = async () => {
    if (!renameTitle.trim() || renameTitle === renamingBook?.title) {
      setRenameDialogOpen(false);
      return;
    }
    setIsRenaming(true);
    try {
      const updated = await booksApi.rename(renamingBook.id, renameTitle.trim());
      setBooks((prev) =>
        prev.map((b) => (b.id === updated.id ? { ...b, title: updated.title } : b))
      );
      setRenameDialogOpen(false);
    } catch (err: any) {
      setRenameError(err.message);
    } finally {
      setIsRenaming(false);
    }
  };

  const openDeleteDialog = (book: any) => {
    setDeletingBook(book);
    setDeleteError('');
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await booksApi.delete(deletingBook.id);
      setBooks((prev) => prev.filter((b) => b.id !== deletingBook.id));
      setDeleteDialogOpen(false);
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const filtered = books.filter((b) =>
    b.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <Link to="/" className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="font-display text-2xl font-bold text-foreground">MemoryBook</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground font-body hidden sm:block">
              Hey, {user?.displayName || 'there'}!
            </span>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground">Your Books</h1>
            <p className="text-muted-foreground font-body mt-1">
              {books.length} memory books
            </p>
          </div>
          <div className="flex gap-3">
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (open) {
                  setCreateError('');
                  setNewTitle('');
                  setNewTheme('classic');
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="warm">
                  <Plus className="h-4 w-4" /> New Book
                </Button>
              </DialogTrigger>
              <DialogContent className="paper-texture">
                <DialogHeader>
                  <DialogTitle className="text-2xl">Create a new Memory Book</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="font-body">Book Title</Label>
                    <Input
                      placeholder="e.g., Summer Adventures 2026"
                      className="font-body"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateBook()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-body">Theme</Label>
                    <Select value={newTheme} onValueChange={setNewTheme}>
                      <SelectTrigger className="font-body">
                        <SelectValue placeholder="Choose a theme" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="travel">🌍 Travel Diary</SelectItem>
                        <SelectItem value="family">👨‍👩‍👧‍👦 Family Memories</SelectItem>
                        <SelectItem value="friendship">🎓 Friendship</SelectItem>
                        <SelectItem value="romantic">💕 Romantic</SelectItem>
                        <SelectItem value="classic">📖 Classic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {createError && <p className="text-destructive text-sm">{createError}</p>}
                  <Button
                    variant="warm"
                    className="w-full"
                    onClick={handleCreateBook}
                    disabled={isCreating || !newTitle.trim()}
                  >
                    {isCreating ? 'Creating...' : 'Create Book'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your books..."
            className="pl-9 font-body"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading && (
          <div className="text-center py-20">
            <p className="text-muted-foreground font-body">Loading your books...</p>
          </div>
        )}

        {!isLoading && books.length === 0 && (
          <div className="text-center py-20">
            <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">No books yet</h2>
            <p className="text-muted-foreground font-body mb-6">
              Create your first memory book to get started
            </p>
            <Button variant="warm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Create Your First Book
            </Button>
          </div>
        )}

        {/* Books grid */}
        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((book, index) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                {/* ⋯ menu — only rendered for books the user owns */}
                {isOwner(book) && (
                  <div className="absolute top-3 right-3 z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/90"
                          onClick={(e) => e.preventDefault()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openRenameDialog(book)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => openDeleteDialog(book)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}

                <Link
                  to={`/book/${book.id}`}
                  className={`block border-2 rounded-xl p-6 hover:-translate-y-1 transition-all duration-300 page-shadow ${
                    themeColors[book.theme] || themeColors.classic
                  }`}
                >
                  <div className="text-4xl mb-4">{themeEmoji[book.theme] || '📖'}</div>
                  <h3 className="text-xl font-bold text-foreground mb-2 line-clamp-2 pr-6">
                    {book.title}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground font-body">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {book.members?.length || 1} members
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {book._count?.pages || 0} pages
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-body mt-3">
                    <Calendar className="h-3 w-3" />
                    {new Date(book.updatedAt).toLocaleDateString()}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="paper-texture">
          <DialogHeader>
            <DialogTitle>Rename Book</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="font-body">New Title</Label>
              <Input
                autoFocus
                className="font-body"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              />
            </div>
            {renameError && <p className="text-destructive text-sm">{renameError}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="warm"
                onClick={handleRename}
                disabled={isRenaming || !renameTitle.trim()}
              >
                {isRenaming ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingBook?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the book and all its pages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-destructive text-sm px-1">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;