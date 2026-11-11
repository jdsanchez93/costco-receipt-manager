using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CostcoReceipts.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptImageKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ImageKey",
                table: "receipts",
                type: "varchar(256)",
                maxLength: 256,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            // Every existing row was uploaded under the old fixed `.jpg`
            // key, whatever its content type, so backfill exactly that.
            // Nullable rather than required so an older API image, which
            // inserts without ImageKey, still works after this is applied.
            migrationBuilder.Sql(
                "UPDATE receipts SET ImageKey = CONCAT('uploads/', OwnerUserId, '/', ReceiptId, '.jpg') WHERE ImageKey IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ImageKey",
                table: "receipts");
        }
    }
}
