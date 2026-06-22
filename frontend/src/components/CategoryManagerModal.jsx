import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Edit2, Trash2, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../api';
import Button from './ui/Button';
import ConfirmModal from './ui/ConfirmModal';

const CategoryManagerModal = ({ isOpen, onClose, onCategoriesUpdated }) => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await api.get('/categories');
      setCategories(Array.isArray(res) ? res : res.categories || []);
    } catch {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      setAdding(true);
      await api.post('/categories', { name: newCatName.trim() });
      toast.success('Category added successfully');
      setNewCatName('');
      await fetchCategories();
      if (onCategoriesUpdated) onCategoriesUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add category');
    } finally {
      setAdding(false);
    }
  };

  const handleStartEdit = (cat) => {
    setEditingId(cat._id);
    setEditName(cat.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    try {
      setSavingId(id);
      await api.put(`/categories/${id}`, { name: editName.trim() });
      toast.success('Category renamed successfully');
      setEditingId(null);
      setEditName('');
      await fetchCategories();
      if (onCategoriesUpdated) onCategoriesUpdated();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update category');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id) => {
    try {
      setDeletingId(id);
      await api.delete(`/categories/${id}`);
      toast.success('Category deleted successfully');
      await fetchCategories();
      if (onCategoriesUpdated) onCategoriesUpdated();
    } catch {
      toast.error('Failed to delete category');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: '480px', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
        <div className="modal-header" style={{ marginBottom: '16px', borderBottom: '1px solid var(--surface-border)', paddingBottom: '12px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Manage Categories</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Add Category Form */}
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <input 
            type="text" 
            placeholder="New category name... (e.g. Groceries)"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            disabled={adding}
            style={{ 
              flex: 1, 
              padding: '10px 14px', 
              borderRadius: '8px', 
              background: 'var(--input-bg)',
              border: '1px solid var(--surface-border)',
              color: 'var(--text-primary)',
              outline: 'none'
            }}
          />
          <Button type="submit" loading={adding} disabled={!newCatName.trim()}>
            <Plus size={16} /> Add
          </Button>
        </form>

        {/* Categories List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
          {loading && categories.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px' }}>Loading...</div>
          ) : categories.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px' }}>No categories found.</div>
          ) : (
            categories.map((cat) => {
              const isEditing = editingId === cat._id;
              return (
                <div 
                  key={cat._id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '10px 12px', 
                    background: 'rgba(255, 255, 255, 0.02)', 
                    border: '1px solid var(--surface-border)', 
                    borderRadius: '8px',
                    gap: '12px'
                  }}
                >
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={savingId === cat._id}
                      style={{ 
                        flex: 1, 
                        padding: '6px 10px', 
                        borderRadius: '6px', 
                        background: 'var(--input-bg)', 
                        border: '1px solid var(--primary)', 
                        color: 'var(--text-primary)',
                        outline: 'none'
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(cat._id);
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      autoFocus
                    />
                  ) : (
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{cat.name}</span>
                  )}

                  <div style={{ display: 'flex', gap: '6px' }}>
                    {isEditing ? (
                      <>
                        <button 
                          onClick={() => handleSaveEdit(cat._id)} 
                          disabled={savingId === cat._id || !editName.trim()}
                          style={{ background: 'transparent', border: 'none', color: 'var(--success)', cursor: 'pointer', padding: '4px' }}
                          title="Save"
                        >
                          <Check size={16} />
                        </button>
                        <button 
                          onClick={handleCancelEdit} 
                          disabled={savingId === cat._id}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleStartEdit(cat)} 
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                          title="Rename"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirm({ isOpen: true, id: cat._id, name: cat.name })} 
                          disabled={deletingId === cat._id}
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: null, name: '' })}
        onConfirm={async () => {
          const id = deleteConfirm.id;
          setDeleteConfirm({ isOpen: false, id: null, name: '' });
          await handleDelete(id);
        }}
        title="Delete Category?"
        message={`Are you sure you want to delete the category "${deleteConfirm.name}"? This action cannot be undone.`}
        confirmText="Delete"
        isDanger={true}
      />
    </div>,
    document.body
  );
};

export default CategoryManagerModal;
