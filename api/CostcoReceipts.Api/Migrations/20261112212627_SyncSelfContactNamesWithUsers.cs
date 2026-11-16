using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CostcoReceipts.Api.Migrations
{
    /// <inheritdoc />
    public partial class SyncSelfContactNamesWithUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The users row is now the one name an account has: /api/me and
            // every receipt read it (Models/MemberNames). The self-contact
            // keeps a copy only because older images read that instead, so
            // the copies are made equal here and a rollback shows the same
            // name. They could drift before, since nothing but MeController
            // kept them in step.
            //
            // The users row wins, except where it is still the stand-in sub
            // and the self-contact holds a real name — so that comes first.
            migrationBuilder.Sql(@"
                UPDATE users u
                JOIN contacts c ON c.OwnerUserId = u.UserId AND c.UserId = u.UserId
                SET u.DisplayName = c.DisplayName
                WHERE u.DisplayName = u.UserId AND c.DisplayName <> c.UserId;");

            migrationBuilder.Sql(@"
                UPDATE contacts c
                JOIN users u ON u.UserId = c.UserId
                SET c.DisplayName = u.DisplayName
                WHERE c.OwnerUserId = c.UserId AND c.DisplayName <> u.DisplayName;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The names it overwrote aren't kept, and nothing needs them:
            // an older image reads the self-contact, which now matches.
        }
    }
}
