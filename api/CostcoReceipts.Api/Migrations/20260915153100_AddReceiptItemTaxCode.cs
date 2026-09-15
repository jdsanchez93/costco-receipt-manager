using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CostcoReceipts.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptItemTaxCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TaxCode",
                table: "receipt_items",
                type: "varchar(8)",
                maxLength: 8,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TaxCode",
                table: "receipt_items");
        }
    }
}
