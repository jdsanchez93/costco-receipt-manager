import React from 'react';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Paper, Button, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';

interface UserReceipt {
  PK: string;
  SK: string;
  status: 'pending' | 'processed' | 'error';
  created_at: string;
  fileName?: string;
  fileUrl?: string;
  totalAmount?: number;
  receiptDate?: string;
}

interface ReceiptsTableProps {
  receipts: UserReceipt[];
}

const ReceiptsTable: React.FC<ReceiptsTableProps> = ({ receipts }) => {
  const navigate = useNavigate();

  const columns: GridColDef[] = [
    { 
      field: 'receipt_id', 
      headerName: 'Receipt ID', 
      width: 200,
      valueGetter: (value, row) => row.SK.replace('RECEIPT#', ''),
    },
    { 
      field: 'status', 
      headerName: 'Status', 
      width: 120,
      renderCell: (params) => {
        const status = params.value as string;
        const color = status === 'processed' ? 'success' : 
                     status === 'error' ? 'error' : 'default';
        return <Chip label={status} color={color} size="small" />;
      },
    },
    { 
      field: 'created_at', 
      headerName: 'Upload Date', 
      width: 180,
      valueFormatter: (value) => {
        return new Date(value).toLocaleDateString();
      },
    },
    { 
      field: 'receiptDate', 
      headerName: 'Receipt Date', 
      width: 150,
      valueFormatter: (value) => {
        return value ? new Date(value).toLocaleDateString() : '-';
      },
    },
    { 
      field: 'totalAmount', 
      headerName: 'Total Amount', 
      width: 130,
      valueFormatter: (value) => {
        return value ? `$${Number(value).toFixed(2)}` : '-';
      },
    },
    { 
      field: 'fileName', 
      headerName: 'File Name', 
      width: 200,
      flex: 1,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: (params) => {
        const receiptId = params.row.SK.replace('RECEIPT#', '');
        return (
          <Button 
            variant="outlined" 
            size="small"
            onClick={() => navigate(`/receipt/${receiptId}`)}
          >
            View Items
          </Button>
        );
      },
    },
  ];

  const rows = receipts.map((receipt, index) => ({
    id: `${receipt.PK}-${receipt.SK}-${index}`,
    ...receipt,
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
        pageSizeOptions={[10, 25, 50]}
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

export default ReceiptsTable;