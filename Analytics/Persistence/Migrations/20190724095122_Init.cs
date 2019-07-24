using Microsoft.EntityFrameworkCore.Migrations;

namespace BibleNote.Analytics.Persistence.Migrations
{
    public partial class Init : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DocumentFolders",
                columns: table => new
                {
                    DocumentFolderId = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(nullable: false),
                    Path = table.Column<string>(nullable: false),
                    NavigationProviderName = table.Column<string>(nullable: false),
                    ParentFolderId = table.Column<int>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentFolders", x => x.DocumentFolderId);
                    table.ForeignKey(
                        name: "FK_DocumentFolders_DocumentFolders_ParentFolderId",
                        column: x => x.ParentFolderId,
                        principalTable: "DocumentFolders",
                        principalColumn: "DocumentFolderId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Documents",
                columns: table => new
                {
                    DocumentId = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(nullable: false),
                    Path = table.Column<string>(nullable: false),
                    Weight = table.Column<decimal>(nullable: false),
                    DocumentFolderId = table.Column<int>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Documents", x => x.DocumentId);
                    table.ForeignKey(
                        name: "FK_Documents_DocumentFolders_DocumentFolderId",
                        column: x => x.DocumentFolderId,
                        principalTable: "DocumentFolders",
                        principalColumn: "DocumentFolderId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DocumentParagraphs",
                columns: table => new
                {
                    DocumentParagraphId = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Path = table.Column<string>(nullable: true),
                    DocumentId = table.Column<int>(nullable: false),
                    Index = table.Column<int>(nullable: false),
                    DocumentId1 = table.Column<int>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentParagraphs", x => x.DocumentParagraphId);
                    table.ForeignKey(
                        name: "FK_DocumentParagraphs_Documents_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "Documents",
                        principalColumn: "DocumentId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DocumentParagraphs_Documents_DocumentId1",
                        column: x => x.DocumentId1,
                        principalTable: "Documents",
                        principalColumn: "DocumentId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "VerseEntries",
                columns: table => new
                {
                    VerseEntryId = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    VerseId = table.Column<long>(nullable: false),
                    Weight = table.Column<decimal>(nullable: false),
                    Suffix = table.Column<string>(nullable: true),
                    DocumentParagraphId = table.Column<int>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VerseEntries", x => x.VerseEntryId);
                    table.ForeignKey(
                        name: "FK_VerseEntries_DocumentParagraphs_DocumentParagraphId",
                        column: x => x.DocumentParagraphId,
                        principalTable: "DocumentParagraphs",
                        principalColumn: "DocumentParagraphId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "VerseRelations",
                columns: table => new
                {
                    VerseRelationId = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    VerseId = table.Column<long>(nullable: false),
                    RelativeVerseId = table.Column<long>(nullable: false),
                    DocumentParagraphId = table.Column<int>(nullable: false),
                    RelativeDocumentParagraphId = table.Column<int>(nullable: true),
                    RelationWeight = table.Column<decimal>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VerseRelations", x => x.VerseRelationId);
                    table.ForeignKey(
                        name: "FK_VerseRelations_DocumentParagraphs_DocumentParagraphId",
                        column: x => x.DocumentParagraphId,
                        principalTable: "DocumentParagraphs",
                        principalColumn: "DocumentParagraphId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VerseRelations_DocumentParagraphs_RelativeDocumentParagraphId",
                        column: x => x.RelativeDocumentParagraphId,
                        principalTable: "DocumentParagraphs",
                        principalColumn: "DocumentParagraphId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DocumentFolders_ParentFolderId",
                table: "DocumentFolders",
                column: "ParentFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentParagraphs_DocumentId",
                table: "DocumentParagraphs",
                column: "DocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentParagraphs_DocumentId1",
                table: "DocumentParagraphs",
                column: "DocumentId1");

            migrationBuilder.CreateIndex(
                name: "IX_Documents_DocumentFolderId",
                table: "Documents",
                column: "DocumentFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_VerseEntries_DocumentParagraphId",
                table: "VerseEntries",
                column: "DocumentParagraphId");

            migrationBuilder.CreateIndex(
                name: "IX_VerseRelations_DocumentParagraphId",
                table: "VerseRelations",
                column: "DocumentParagraphId");

            migrationBuilder.CreateIndex(
                name: "IX_VerseRelations_RelativeDocumentParagraphId",
                table: "VerseRelations",
                column: "RelativeDocumentParagraphId");

            migrationBuilder.CreateIndex(
                name: "IX_VerseRelations_RelativeVerseId",
                table: "VerseRelations",
                column: "RelativeVerseId");

            migrationBuilder.CreateIndex(
                name: "IX_VerseRelations_VerseId",
                table: "VerseRelations",
                column: "VerseId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VerseEntries");

            migrationBuilder.DropTable(
                name: "VerseRelations");

            migrationBuilder.DropTable(
                name: "DocumentParagraphs");

            migrationBuilder.DropTable(
                name: "Documents");

            migrationBuilder.DropTable(
                name: "DocumentFolders");
        }
    }
}
