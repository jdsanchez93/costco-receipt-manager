import React from 'react';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Box, Paper, Chip } from '@mui/material';
import { ReceiptItem, ReceiptMember } from '../types/singleTableTypes';

interface ItemsTableProps {
  items: ReceiptItem[];
  members?: ReceiptMember[];
  getMemberColor?: (userId: string) => string;
  isSharedView?: boolean;
}

const ItemsTable: React.FC<ItemsTableProps> = ({ 
  items, 
  members = [], 
  getMemberColor,
  isSharedView = false 
}) => {
  // Helper function to get member display name from user ID
  const getMemberDisplayName = (userId: string): string => {
    const member = members.find(m => 
      (m.user_id === userId) || (m.placeholder_id === userId)
    );
    return member?.display_name || userId;
  };
  // Mobile-responsive column configuration
  const baseColumns: GridColDef[] = [
    { 
      field: 'item_number', 
      headerName: 'Item #', 
      width: 100,
      hideable: true,
      // Hide on mobile for shared view
      ...(isSharedView && {
        hideable: true,
      })
    },
    { 
      field: 'item_name', 
      headerName: 'Item Name', 
      minWidth: 200,
      flex: 2, // Give more space on mobile
    },
    { 
      field: 'price', 
      headerName: 'Price', 
      width: 100,
      valueFormatter: (value) => {
        return `$${Number(value).toFixed(2)}`;
      },
    },
    { 
      field: 'discount', 
      headerName: 'Discount', 
      width: 100,
      hideable: true,
      valueFormatter: (value) => {
        return value ? `-$${Number(value).toFixed(2)}` : '-';
      },
    },
    { 
      field: 'final_price', 
      headerName: 'Total', 
      width: 100,
      valueGetter: (value, row) => row.price - (row.discount || 0),
      valueFormatter: (value) => {
        return `$${Number(value).toFixed(2)}`;
      },
    },
    { 
      field: 'assigned_users', 
      headerName: 'Assigned To', 
      minWidth: 180,
      flex: 1.5,
      renderCell: (params) => {
        const users = params.value as string[];
        if (!users || users.length === 0) {
          return <Chip label="Unassigned" size="small" variant="outlined" />;
        }
        return (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', py: 0.5 }}>
            {users.map((userId, index) => (
              <Chip 
                key={index} 
                label={getMemberDisplayName(userId)} 
                size="small" 
                color={getMemberColor ? getMemberColor(userId) as any : 'primary'}
                sx={{ fontSize: '0.75rem', height: 24 }}
              />
            ))}
          </Box>
        );
      },
    },
  ];

  // Filter columns based on screen size and view type
  const columns = isSharedView 
    ? baseColumns.filter(col => {
        // On shared view, we might want to hide some columns on mobile
        // This will be handled by DataGrid's responsive features
        return true;
      })
    : baseColumns;

  const rows = items.map((item, index) => ({
    id: `${item.PK}-${item.SK}-${index}`,
    ...item,
  }));

  return (
    <Paper sx={{ width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        initialState={{
          pagination: {
            paginationModel: { page: 0, pageSize: isSharedView ? 25 : 10 },
          },
          columns: {
            columnVisibilityModel: {
              // Hide item_number on mobile for shared view
              ...(isSharedView && {
                item_number: false, // Hidden by default, can be toggled
              }),
            },
          },
        }}
        pageSizeOptions={isSharedView ? [25, 50, 100] : [10, 25, 50, 100]}
        disableRowSelectionOnClick
        autoHeight
        sx={{
          // Mobile-optimized styles
          '& .MuiDataGrid-cell': {
            borderBottom: '1px solid rgba(224, 224, 224, 1)',
            padding: '8px 4px', // Tighter padding on mobile
            fontSize: { xs: '0.875rem', sm: '1rem' },
          },
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: 'background.default',
            borderBottom: '2px solid rgba(224, 224, 224, 1)',
            fontSize: { xs: '0.875rem', sm: '1rem' },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 600,
            },
          },
          '& .MuiDataGrid-row': {
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          },
          // Better mobile scrolling
          '& .MuiDataGrid-virtualScroller': {
            // Ensure horizontal scroll on mobile
            overflowX: 'auto',
          },
          // Mobile-specific adjustments
          '@media (max-width: 600px)': {
            '& .MuiDataGrid-cell': {
              padding: '6px 2px',
              fontSize: '0.8rem',
            },
            '& .MuiDataGrid-columnHeaders': {
              fontSize: '0.8rem',
            },
          },
        }}
      />
    </Paper>
  );
};

export default ItemsTable;