import React from 'react';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Box, Paper, Chip } from '@mui/material';

interface ReceiptItem {
  PK: string;
  SK: string;
  item_number: string;
  item_name: string;
  price: number;
  discount: number;
  receipt_id: string;
  assigned_users: string[];
}

interface ItemsTableProps {
  items: ReceiptItem[];
}

const ItemsTable: React.FC<ItemsTableProps> = ({ items }) => {
  const columns: GridColDef[] = [
    { 
      field: 'item_number', 
      headerName: 'Item #', 
      width: 100 
    },
    { 
      field: 'item_name', 
      headerName: 'Item Name', 
      width: 300,
      flex: 1,
    },
    { 
      field: 'price', 
      headerName: 'Price', 
      width: 120,
      valueFormatter: (value) => {
        return `$${Number(value).toFixed(2)}`;
      },
    },
    { 
      field: 'discount', 
      headerName: 'Discount', 
      width: 120,
      valueFormatter: (value) => {
        return value ? `$${Number(value).toFixed(2)}` : '-';
      },
    },
    { 
      field: 'final_price', 
      headerName: 'Final Price', 
      width: 120,
      valueGetter: (value, row) => row.price - (row.discount || 0),
      valueFormatter: (value) => {
        return `$${Number(value).toFixed(2)}`;
      },
    },
    { 
      field: 'receipt_id', 
      headerName: 'Receipt ID', 
      width: 200,
    },
    { 
      field: 'assigned_users', 
      headerName: 'Assigned Users', 
      width: 200,
      renderCell: (params) => {
        const users = params.value as string[];
        if (!users || users.length === 0) {
          return <Chip label="Unassigned" size="small" />;
        }
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {users.map((user, index) => (
              <Chip key={index} label={user} size="small" color="primary" />
            ))}
          </Box>
        );
      },
    },
  ];

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
            paginationModel: { page: 0, pageSize: 10 },
          },
        }}
        pageSizeOptions={[10, 25, 50, 100]}
        disableRowSelectionOnClick
        autoHeight
        sx={{
          '& .MuiDataGrid-cell': {
            borderBottom: '1px solid rgba(224, 224, 224, 1)',
          },
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: 'background.default',
            borderBottom: '2px solid rgba(224, 224, 224, 1)',
          },
        }}
      />
    </Paper>
  );
};

export default ItemsTable;