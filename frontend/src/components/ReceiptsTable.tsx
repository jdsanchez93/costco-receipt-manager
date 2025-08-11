import React from 'react';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Paper, Button, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import ErrorIcon from '@mui/icons-material/Error';
import { ReceiptMember } from '../types/singleTableTypes';

interface ReceiptsTableProps {
  receiptMembers: ReceiptMember[];
}

const ReceiptsTable: React.FC<ReceiptsTableProps> = ({ receiptMembers }) => {
  const navigate = useNavigate();

  const columns: GridColDef[] = [
    { 
      field: 'receipt_id', 
      headerName: 'Receipt ID', 
      width: 200,
      valueGetter: (value, row) => row.receipt_id,
    },
    { 
      field: 'user_type', 
      headerName: 'Member Type', 
      width: 120,
      renderCell: (params) => {
        const userType = params.value as string;
        const color = userType === 'authenticated' ? 'primary' : 'default';
        return <Chip label={userType === 'authenticated' ? 'User' : 'Placeholder'} color={color} size="small" />;
      },
    },
    { 
      field: 'added_at', 
      headerName: 'Joined Date', 
      width: 180,
      valueFormatter: (value) => {
        return new Date(value).toLocaleDateString();
      },
    },
    { 
      field: 'display_name', 
      headerName: 'Your Role', 
      width: 150,
    },
    { 
      field: 'validationStatus', 
      headerName: 'Validation', 
      width: 130,
      renderCell: (params) => {
        const status = params.value as 'pending' | 'confirmed' | 'disputed' | undefined;
        if (!status) {
          return (
            <Chip 
              label="Pending" 
              color="warning" 
              size="small" 
              icon={<PendingIcon />}
            />
          );
        }
        
        const config = {
          confirmed: { label: 'Confirmed', color: 'success' as const, icon: <CheckCircleIcon /> },
          disputed: { label: 'Disputed', color: 'error' as const, icon: <ErrorIcon /> },
          pending: { label: 'Pending', color: 'warning' as const, icon: <PendingIcon /> },
        };
        
        const { label, color, icon } = config[status] || config.pending;
        return <Chip label={label} color={color} size="small" icon={icon} />;
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 140,
      sortable: false,
      renderCell: (params) => {
        const receiptId = params.row.receipt_id;
        const needsValidation = !params.row.validationStatus;
        return (
          <Button 
            variant={needsValidation ? "contained" : "outlined"}
            color={needsValidation ? "primary" : "inherit"}
            size="small"
            onClick={() => navigate(`/receipt/${receiptId}`)}
          >
            {needsValidation ? 'Validate' : 'View Details'}
          </Button>
        );
      },
    },
  ];

  const rows = receiptMembers.map((member, index) => ({
    id: `${member.PK}-${member.SK}-${index}`,
    ...member,
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
          sorting: {
            sortModel: [{ field: 'created_at', sort: 'desc' }],
          },
        }}
        pageSizeOptions={[10, 25, 50]}
        disableRowSelectionOnClick
        autoHeight
        sx={{
          border: (theme) => `1px solid ${theme.palette.divider}`,
          '& .MuiDataGrid-cell': {
            borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          },
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'background.default',
            borderBottom: (theme) => `2px solid ${theme.palette.divider}`,
          },
        }}
      />
    </Paper>
  );
};

export default ReceiptsTable;