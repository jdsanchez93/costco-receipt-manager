import React from 'react';
import {
  Paper,
  Typography,
  Box,
  Chip,
  Divider,
  Grid,
  Stack,
} from '@mui/material';
import {
  AccountCircle as AccountCircleIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { ReceiptItem, ReceiptMember } from '../types/singleTableTypes';

interface MemberTotalsProps {
  items: ReceiptItem[];
  members: ReceiptMember[];
  getMemberColor?: (userId: string) => string;
}

interface MemberTotal {
  member: ReceiptMember;
  assignedItems: ReceiptItem[];
  subtotal: number;
  totalDiscount: number;
  finalTotal: number;
  itemCount: number;
}

const MemberTotals: React.FC<MemberTotalsProps> = ({ items, members, getMemberColor }) => {
  // Calculate totals for each member
  const memberTotals: MemberTotal[] = members.map(member => {
    const memberId = member.user_id || member.placeholder_id || '';
    
    // Find all items assigned to this member
    const assignedItems = items.filter(item => 
      item.assigned_users.includes(memberId)
    );

    // Calculate totals with proper splitting for shared items
    let subtotal = 0;
    let totalDiscount = 0;

    assignedItems.forEach(item => {
      const assignedUserCount = item.assigned_users.length;
      if (assignedUserCount > 0) {
        // Split the price and discount equally among assigned users
        const itemPrice = (item.price || 0) / assignedUserCount;
        const itemDiscount = (item.discount || 0) / assignedUserCount;
        
        subtotal += itemPrice;
        totalDiscount += itemDiscount;
      }
    });

    const finalTotal = subtotal - totalDiscount;

    return {
      member,
      assignedItems,
      subtotal,
      totalDiscount,
      finalTotal,
      itemCount: assignedItems.length,
    };
  });

  // Calculate shared items (items assigned to multiple members)
  const sharedItems = items.filter(item => item.assigned_users.length > 1);
  
  // Calculate unassigned items
  const unassignedItems = items.filter(item => item.assigned_users.length === 0);
  const unassignedSubtotal = unassignedItems.reduce((sum, item) => sum + (item.price || 0), 0);
  const unassignedDiscount = unassignedItems.reduce((sum, item) => sum + (item.discount || 0), 0);
  const unassignedTotal = unassignedSubtotal - unassignedDiscount;

  // Calculate receipt totals (these should match the original receipt totals)
  const receiptSubtotal = items.reduce((sum, item) => sum + (item.price || 0), 0);
  const receiptDiscount = items.reduce((sum, item) => sum + (item.discount || 0), 0);
  const receiptTotal = receiptSubtotal - receiptDiscount;

  // Calculate verification: sum of all member totals + unassigned should equal receipt total
  const assignedTotal = memberTotals.reduce((sum, mt) => sum + mt.finalTotal, 0) + unassignedTotal;
  const totalDiscrepancy = Math.abs(receiptTotal - assignedTotal);

  const getMemberIcon = (member: ReceiptMember) => {
    return member.user_type === 'authenticated' ? (
      <AccountCircleIcon fontSize="small" />
    ) : (
      <PersonIcon fontSize="small" />
    );
  };

  const getMemberDisplayName = (member: ReceiptMember) => {
    return member.display_name || 'Unknown Member';
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Member Totals
      </Typography>

      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { 
          xs: '1fr', 
          sm: 'repeat(2, 1fr)', 
          md: 'repeat(3, 1fr)' 
        }, 
        gap: 3,
        mb: 3
      }}>
        {/* Individual Member Totals */}
        {memberTotals.map((memberTotal) => {
          const memberId = memberTotal.member.user_id || memberTotal.member.placeholder_id || '';
          const memberColor = getMemberColor ? getMemberColor(memberId) : 
            (memberTotal.member.user_type === 'authenticated' ? 'primary' : 'default');
          
          return (
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }} key={memberTotal.member.SK}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Chip
                  icon={getMemberIcon(memberTotal.member)}
                  label={getMemberDisplayName(memberTotal.member)}
                  color={memberColor as any}
                  size="small"
                />
              </Box>

            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Items Assigned:
                </Typography>
                <Typography variant="body2">
                  {memberTotal.itemCount}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Subtotal:
                </Typography>
                <Typography variant="body2">
                  ${memberTotal.subtotal.toFixed(2)}
                </Typography>
              </Box>

              {memberTotal.totalDiscount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Discounts:
                  </Typography>
                  <Typography variant="body2" color="success.main">
                    -${memberTotal.totalDiscount.toFixed(2)}
                  </Typography>
                </Box>
              )}

              <Divider />

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2" fontWeight="bold">
                  Total:
                </Typography>
                <Typography variant="subtitle2" fontWeight="bold" color="primary">
                  ${memberTotal.finalTotal.toFixed(2)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
          );
        })}

        {/* Unassigned Items */}
        {unassignedItems.length > 0 && (
          <Paper variant="outlined" sx={{ p: 2, height: '100%', bgcolor: 'warning.light', opacity: 0.7 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Chip
                label="Unassigned Items"
                color="warning"
                size="small"
              />
            </Box>

            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Items:
                </Typography>
                <Typography variant="body2">
                  {unassignedItems.length}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Subtotal:
                </Typography>
                <Typography variant="body2">
                  ${unassignedSubtotal.toFixed(2)}
                </Typography>
              </Box>

              {unassignedDiscount > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Discounts:
                  </Typography>
                  <Typography variant="body2" color="success.main">
                    -${unassignedDiscount.toFixed(2)}
                  </Typography>
                </Box>
              )}

              <Divider />

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2" fontWeight="bold">
                  Total:
                </Typography>
                <Typography variant="subtitle2" fontWeight="bold" color="warning.main">
                  ${unassignedTotal.toFixed(2)}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        )}
      </Box>

      {/* Receipt Summary */}
      <Paper variant="outlined" sx={{ 
        p: 2, 
        bgcolor: (theme) => theme.palette.mode === 'dark' 
          ? 'rgba(66, 178, 255, 0.1)' 
          : 'rgba(25, 118, 210, 0.1)',
        border: (theme) => `1px solid ${theme.palette.mode === 'dark' 
          ? 'rgba(66, 178, 255, 0.3)' 
          : 'rgba(25, 118, 210, 0.3)'}`
      }}>
        <Typography variant="h6" gutterBottom>
          Receipt Summary
        </Typography>

        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { 
            xs: '1fr', 
            sm: 'repeat(2, 1fr)', 
            md: receiptDiscount > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)' 
          }, 
          gap: 2,
          mb: 2
        }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" fontWeight="bold" color="primary">
              {items.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Items
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" fontWeight="bold">
              ${receiptSubtotal.toFixed(2)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Subtotal
            </Typography>
          </Box>

          {receiptDiscount > 0 && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h4" fontWeight="bold" color="success.main">
                -${receiptDiscount.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Discounts
              </Typography>
            </Box>
          )}

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" fontWeight="bold" color="primary">
              ${receiptTotal.toFixed(2)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Receipt Total
            </Typography>
          </Box>
        </Box>

        {/* Additional Info */}
        <Box>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            {sharedItems.length > 0 && (
              <Chip
                label={`${sharedItems.length} shared item${sharedItems.length !== 1 ? 's' : ''}`}
                size="small"
                color="info"
              />
            )}
            {unassignedItems.length > 0 && (
              <Chip
                label={`${unassignedItems.length} unassigned item${unassignedItems.length !== 1 ? 's' : ''}`}
                size="small"
                color="warning"
              />
            )}
            <Chip
              label={`${members.length} member${members.length !== 1 ? 's' : ''}`}
              size="small"
              color="default"
            />
            {/* Show calculation verification (helpful for transparency) */}
            {totalDiscrepancy < 0.01 ? (
              <Chip
                label="✓ Totals verified"
                size="small"
                color="success"
              />
            ) : (
              <Chip
                label={`⚠ Discrepancy: $${totalDiscrepancy.toFixed(2)}`}
                size="small"
                color="error"
              />
            )}
          </Stack>
        </Box>
      </Paper>
    </Paper>
  );
};

export default MemberTotals;