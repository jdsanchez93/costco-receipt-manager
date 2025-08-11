import React, { useState, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  IconButton,
  Button,
  Checkbox,
  Menu,
  MenuItem,
  Toolbar,
  Alert,
  Divider,
  Stack,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Person as PersonIcon,
  AccountCircle as AccountCircleIcon,
  SelectAll as SelectAllIcon,
  Clear as ClearIcon,
  Share as ShareIcon,
  AssignmentInd as AssignIcon,
} from '@mui/icons-material';
import { ReceiptItem, ReceiptMember } from '../types/singleTableTypes';
import { updateItemAssignment, bulkUpdateItemAssignments, clearAllItemAssignments } from '../services/api';

interface ItemAssignmentProps {
  items: ReceiptItem[];
  members: ReceiptMember[];
  receiptId: string;
  onAssignmentChange: () => void;
}

const ItemAssignment: React.FC<ItemAssignmentProps> = ({
  items,
  members,
  receiptId,
  onAssignmentChange,
}) => {
  const { user, getAccessTokenSilently } = useAuth0();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuContext, setMenuContext] = useState<{ itemSK?: string; action?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get current user's member info
  const currentUserMember = members.find(member => 
    member.user_type === 'authenticated' && member.email === user?.email
  );

  const handleItemSelect = useCallback((itemSK: string, selected: boolean) => {
    setSelectedItems(prev => {
      const newSelected = new Set(prev);
      if (selected) {
        newSelected.add(itemSK);
      } else {
        newSelected.delete(itemSK);
      }
      return newSelected;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(item => item.SK)));
    }
  }, [selectedItems.size, items]);

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>, context: { itemSK?: string; action?: string }) => {
    setAnchorEl(event.currentTarget);
    setMenuContext(context);
  }, []);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
    setMenuContext(null);
  }, []);

  const getMemberIcon = (member: ReceiptMember) => {
    return member.user_type === 'authenticated' ? (
      <AccountCircleIcon fontSize="small" />
    ) : (
      <PersonIcon fontSize="small" />
    );
  };

  const getMemberDisplayName = (member: ReceiptMember) => {
    if (member.user_type === 'authenticated' && member.email === user?.email) {
      return 'You';
    }
    return member.display_name;
  };

  const isItemAssignedToMember = (item: ReceiptItem, memberId: string) => {
    return item.assigned_users.includes(memberId);
  };

  const toggleItemAssignment = async (itemSK: string, memberId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      const item = items.find(i => i.SK === itemSK);
      if (!item) return;

      let updatedAssignedUsers: string[];
      if (item.assigned_users.includes(memberId)) {
        // Remove assignment
        updatedAssignedUsers = item.assigned_users.filter(id => id !== memberId);
      } else {
        // Add assignment
        updatedAssignedUsers = [...item.assigned_users, memberId];
      }

      // Extract item index from SK (e.g., "ITEM#001" -> "001")
      const itemIndex = itemSK.replace('ITEM#', '');
      await updateItemAssignment(receiptId, itemIndex, updatedAssignedUsers, token);
      onAssignmentChange();
    } catch (err) {
      console.error('Error updating assignment:', err);
      setError('Failed to update assignment');
    } finally {
      setLoading(false);
    }
  };

  const assignSelectedToMember = async (memberId: string) => {
    if (selectedItems.size === 0) return;

    setLoading(true);
    setError(null);
    
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      const updates = Array.from(selectedItems).map(itemSK => {
        const item = items.find(i => i.SK === itemSK);
        const currentUsers = item ? item.assigned_users : [];
        const updatedAssignedUsers = Array.from(new Set([...currentUsers, memberId]));
        // Extract item index from SK (e.g., "ITEM#001" -> "001")
        const itemIndex = itemSK.replace('ITEM#', '');
        return { itemId: itemIndex, assignedUsers: updatedAssignedUsers };
      });

      await bulkUpdateItemAssignments(receiptId, updates, token);
      setSelectedItems(new Set());
      onAssignmentChange();
    } catch (err) {
      console.error('Error with bulk assignment:', err);
      setError('Failed to update assignments');
    } finally {
      setLoading(false);
    }
    
    handleMenuClose();
  };

  const assignAllToMe = async () => {
    if (!currentUserMember) return;
    
    const unassignedItems = items.filter(item => item.assigned_users.length === 0);
    if (unassignedItems.length === 0) return;

    setLoading(true);
    setError(null);
    
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      const myUserId = currentUserMember.user_id || currentUserMember.placeholder_id || '';
      const updates = unassignedItems.map(item => {
        // Extract item index from SK (e.g., "ITEM#001" -> "001")
        const itemIndex = item.SK.replace('ITEM#', '');
        return {
          itemId: itemIndex,
          assignedUsers: [myUserId]
        };
      });

      await bulkUpdateItemAssignments(receiptId, updates, token);
      onAssignmentChange();
    } catch (err) {
      console.error('Error assigning all items:', err);
      setError('Failed to assign items');
    } finally {
      setLoading(false);
    }
  };

  const splitSelectedEvenly = async () => {
    if (selectedItems.size === 0 || members.length === 0) return;

    setLoading(true);
    setError(null);
    
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      const memberIds = members.map(m => m.user_id || m.placeholder_id || '').filter(id => id);
      const updates = Array.from(selectedItems).map(itemSK => {
        // Extract item index from SK (e.g., "ITEM#001" -> "001")
        const itemIndex = itemSK.replace('ITEM#', '');
        return {
          itemId: itemIndex,
          assignedUsers: memberIds
        };
      });

      await bulkUpdateItemAssignments(receiptId, updates, token);
      setSelectedItems(new Set());
      onAssignmentChange();
    } catch (err) {
      console.error('Error splitting items:', err);
      setError('Failed to split items');
    } finally {
      setLoading(false);
    }
  };

  const clearAllAssignments = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      await clearAllItemAssignments(receiptId, token);
      onAssignmentChange();
    } catch (err) {
      console.error('Error clearing assignments:', err);
      setError('Failed to clear assignments');
    } finally {
      setLoading(false);
    }
  };

  const clearSelectedAssignments = async () => {
    if (selectedItems.size === 0) return;

    setLoading(true);
    setError(null);
    
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: process.env.REACT_APP_AUTH0_AUDIENCE,
        },
      });

      const updates = Array.from(selectedItems).map(itemSK => {
        // Extract item index from SK (e.g., "ITEM#001" -> "001")
        const itemIndex = itemSK.replace('ITEM#', '');
        return {
          itemId: itemIndex,
          assignedUsers: []
        };
      });

      await bulkUpdateItemAssignments(receiptId, updates, token);
      setSelectedItems(new Set());
      onAssignmentChange();
    } catch (err) {
      console.error('Error clearing selected assignments:', err);
      setError('Failed to clear assignments');
    } finally {
      setLoading(false);
    }
  };

  const unassignedItems = items.filter(item => item.assigned_users.length === 0);
  const hasSelected = selectedItems.size > 0;
  const allSelected = selectedItems.size === items.length;

  return (
    <Paper sx={{ p: 0 }}>
      {/* Bulk Actions Toolbar */}
      <Toolbar 
        variant="dense" 
        sx={{ 
          bgcolor: hasSelected ? 'action.selected' : 'transparent',
          borderBottom: 1,
          borderColor: 'divider'
        }}
      >
        <Checkbox
          checked={allSelected}
          indeterminate={hasSelected && !allSelected}
          onChange={handleSelectAll}
          icon={<SelectAllIcon />}
          checkedIcon={<SelectAllIcon />}
        />
        
        <Typography variant="body2" sx={{ ml: 1, flexGrow: 1 }}>
          {hasSelected ? `${selectedItems.size} selected` : `${items.length} items`}
        </Typography>

        {hasSelected ? (
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              onClick={(e) => handleMenuOpen(e, { action: 'assignSelected' })}
              startIcon={<AssignIcon />}
            >
              Assign to...
            </Button>
            <Button
              size="small"
              onClick={splitSelectedEvenly}
              startIcon={<ShareIcon />}
              disabled={loading}
            >
              Split Evenly
            </Button>
            <Button
              size="small"
              onClick={clearSelectedAssignments}
              startIcon={<ClearIcon />}
              disabled={loading}
            >
              Clear
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" spacing={1}>
            {currentUserMember && unassignedItems.length > 0 && (
              <Button
                size="small"
                onClick={assignAllToMe}
                startIcon={<AssignIcon />}
                disabled={loading}
              >
                Assign Unassigned to Me ({unassignedItems.length})
              </Button>
            )}
            <Button
              size="small"
              onClick={clearAllAssignments}
              startIcon={<ClearIcon />}
              disabled={loading}
              color="warning"
            >
              Clear All
            </Button>
          </Stack>
        )}
      </Toolbar>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* Items List */}
      <Box sx={{ p: 2 }}>
        {items.map((item, index) => (
          <Box key={item.SK}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', py: 2 }}>
              <Checkbox
                checked={selectedItems.has(item.SK)}
                onChange={(e) => handleItemSelect(item.SK, e.target.checked)}
                sx={{ mt: -1 }}
              />
              
              <Box sx={{ flexGrow: 1, ml: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography variant="body1" fontWeight="medium">
                    {item.item_name}
                  </Typography>
                  <Typography variant="body1" color="primary" fontWeight="bold">
                    ${(item.price || 0).toFixed(2)}
                    {(item.discount || 0) > 0 && (
                      <Typography component="span" variant="body2" color="success.main" sx={{ ml: 1 }}>
                        (-${(item.discount || 0).toFixed(2)})
                      </Typography>
                    )}
                  </Typography>
                </Box>
                
                {/* Assignment Chips */}
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {item.assigned_users.length === 0 ? (
                    <Chip
                      label="Unassigned"
                      size="small"
                      variant="outlined"
                      color="default"
                    />
                  ) : (
                    item.assigned_users.map((userId) => {
                      const member = members.find(m => 
                        (m.user_id === userId) || (m.placeholder_id === userId)
                      );
                      if (!member) return null;
                      
                      return (
                        <Chip
                          key={userId}
                          label={getMemberDisplayName(member)}
                          size="small"
                          icon={getMemberIcon(member)}
                          onDelete={() => toggleItemAssignment(item.SK, userId)}
                          color={member.user_type === 'authenticated' ? 'primary' : 'default'}
                        />
                      );
                    })
                  )}
                  
                  {/* Add Member Button */}
                  <Tooltip title="Assign to member">
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, { itemSK: item.SK, action: 'addMember' })}
                      disabled={loading}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  
                  {/* Split Evenly Button for this item */}
                  {members.length > 1 && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={async () => {
                        setLoading(true);
                        setError(null);
                        
                        try {
                          const token = await getAccessTokenSilently({
                            authorizationParams: {
                              audience: process.env.REACT_APP_AUTH0_AUDIENCE,
                            },
                          });

                          const memberIds = members.map(m => m.user_id || m.placeholder_id || '').filter(id => id);
                          // Extract item index from SK (e.g., "ITEM#001" -> "001")
                          const itemIndex = item.SK.replace('ITEM#', '');
                          await updateItemAssignment(receiptId, itemIndex, memberIds, token);
                          onAssignmentChange();
                        } catch (err) {
                          console.error('Error splitting item:', err);
                          setError('Failed to split item');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                      sx={{ ml: 1 }}
                    >
                      Split Evenly
                    </Button>
                  )}
                </Stack>
              </Box>
            </Box>
            
            {index < items.length - 1 && <Divider />}
          </Box>
        ))}

        {items.length === 0 && (
          <Box textAlign="center" py={8}>
            <Typography variant="body1" color="text.secondary">
              No items to assign
            </Typography>
          </Box>
        )}
      </Box>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {menuContext?.action === 'addMember' && members.map((member) => (
          <MenuItem
            key={member.SK}
            onClick={() => {
              if (menuContext.itemSK) {
                toggleItemAssignment(menuContext.itemSK, member.user_id || member.placeholder_id || '');
              }
              handleMenuClose();
            }}
            disabled={loading}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {getMemberIcon(member)}
              <Typography>{getMemberDisplayName(member)}</Typography>
            </Box>
          </MenuItem>
        ))}
        
        {menuContext?.action === 'assignSelected' && members.map((member) => (
          <MenuItem
            key={member.SK}
            onClick={() => assignSelectedToMember(member.user_id || member.placeholder_id || '')}
            disabled={loading}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {getMemberIcon(member)}
              <Typography>{getMemberDisplayName(member)}</Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </Paper>
  );
};

export default ItemAssignment;