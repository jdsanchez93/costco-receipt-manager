interface BoundingBox {
  Width: number;
  Height: number;
  Left: number;
  Top: number;
}

interface Point {
  X: number;
  Y: number;
}

export interface ReceiptGeometry {
  PK: string; // RECEIPT#receipt_id
  SK: string; // FIELD#FIELDNAME_TYPE (e.g., FIELD#SUBTOTAL_VALUE)
  receipt_id: string;
  field_name: string; // e.g., "subtotal", "tax", "total"
  field_type: 'label' | 'value';
  text: string;
  confidence: number;
  bounding_box: BoundingBox;
  polygon: Point[];
  created_at: string;
}