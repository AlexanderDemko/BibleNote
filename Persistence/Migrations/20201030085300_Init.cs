using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BibleNote.Persistence.Migrations
{
    public partial class Init : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "NavigationProvidersInfo",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(nullable: false),
                    Description = table.Column<string>(nullable: true),
                    IsReadonly = table.Column<bool>(nullable: false),
                    FullTypeName = table.Column<string>(nullable: false),
                    ParametersRaw = table.Column<string>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NavigationProvidersInfo", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AnalysisSessions",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    StartTime = table.Column<DateTime>(nullable: false),
                    FinishTime = table.Column<DateTime>(nullable: true),
                    NavigationProviderId = table.Column<int>(nullable: false),
                    CreatedDocumentsCount = table.Column<int>(nullable: false),
                    UpdatedDocumentsCount = table.Column<int>(nullable: false),
                    DeletedDocumentsCount = table.Column<int>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnalysisSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AnalysisSessions_NavigationProvidersInfo_NavigationProviderId",
                        column: x => x.NavigationProviderId,
                        principalTable: "NavigationProvidersInfo",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DocumentFolders",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(nullable: false),
                    Path = table.Column<string>(nullable: false),
                    ParentFolderId = table.Column<int>(nullable: true),
                    NavigationProviderId = table.Column<int>(nullable: false),
                    LatestAnalysisSessionId = table.Column<int>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentFolders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DocumentFolders_AnalysisSessions_LatestAnalysisSessionId",
                        column: x => x.LatestAnalysisSessionId,
                        principalTable: "AnalysisSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DocumentFolders_NavigationProvidersInfo_NavigationProviderId",
                        column: x => x.NavigationProviderId,
                        principalTable: "NavigationProvidersInfo",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DocumentFolders_DocumentFolders_ParentFolderId",
                        column: x => x.ParentFolderId,
                        principalTable: "DocumentFolders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Documents",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(nullable: false),
                    Path = table.Column<string>(nullable: false),
                    Weight = table.Column<decimal>(nullable: false),
                    LastModifiedTime = table.Column<DateTime>(nullable: true),
                    DocumentFolderId = table.Column<int>(nullable: false),
                    LatestAnalysisSessionId = table.Column<int>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Documents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Documents_DocumentFolders_DocumentFolderId",
                        column: x => x.DocumentFolderId,
                        principalTable: "DocumentFolders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Documents_AnalysisSessions_LatestAnalysisSessionId",
                        column: x => x.LatestAnalysisSessionId,
                        principalTable: "AnalysisSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DocumentParagraphs",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Path = table.Column<string>(nullable: true),
                    DocumentId = table.Column<int>(nullable: false),
                    Index = table.Column<int>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentParagraphs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DocumentParagraphs_Documents_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "Documents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VerseEntries",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    VerseId = table.Column<long>(nullable: false),
                    Weight = table.Column<decimal>(nullable: false),
                    Suffix = table.Column<string>(nullable: true),
                    DocumentParagraphId = table.Column<int>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VerseEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VerseEntries_DocumentParagraphs_DocumentParagraphId",
                        column: x => x.DocumentParagraphId,
                        principalTable: "DocumentParagraphs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VerseRelations",
                columns: table => new
                {
                    Id = table.Column<int>(nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    VerseId = table.Column<long>(nullable: false),
                    RelativeVerseId = table.Column<long>(nullable: false),
                    DocumentParagraphId = table.Column<int>(nullable: false),
                    RelativeDocumentParagraphId = table.Column<int>(nullable: true),
                    RelationWeight = table.Column<decimal>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VerseRelations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VerseRelations_DocumentParagraphs_DocumentParagraphId",
                        column: x => x.DocumentParagraphId,
                        principalTable: "DocumentParagraphs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_VerseRelations_DocumentParagraphs_RelativeDocumentParagraphId",
                        column: x => x.RelativeDocumentParagraphId,
                        principalTable: "DocumentParagraphs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AnalysisSessions_NavigationProviderId",
                table: "AnalysisSessions",
                column: "NavigationProviderId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentFolders_LatestAnalysisSessionId",
                table: "DocumentFolders",
                column: "LatestAnalysisSessionId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentFolders_ParentFolderId",
                table: "DocumentFolders",
                column: "ParentFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentFolders_NavigationProviderId_Path",
                table: "DocumentFolders",
                columns: new[] { "NavigationProviderId", "Path" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DocumentParagraphs_DocumentId",
                table: "DocumentParagraphs",
                column: "DocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_Documents_DocumentFolderId",
                table: "Documents",
                column: "DocumentFolderId");

            migrationBuilder.CreateIndex(
                name: "IX_Documents_LatestAnalysisSessionId",
                table: "Documents",
                column: "LatestAnalysisSessionId");

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

            migrationBuilder.DropTable(
                name: "AnalysisSessions");

            migrationBuilder.DropTable(
                name: "NavigationProvidersInfo");
        }
    }
}
