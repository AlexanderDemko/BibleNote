﻿// <auto-generated />
using System;
using BibleNote.Analytics.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace BibleNote.Analytics.Persistence.Migrations
{
    [DbContext(typeof(AnalyticsContext))]
    [Migration("20190724095122_Init")]
    partial class Init
    {
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("ProductVersion", "2.2.6-servicing-10079");

            modelBuilder.Entity("BibleNote.Analytics.Data.Entities.Document", b =>
                {
                    b.Property<int>("DocumentId")
                        .ValueGeneratedOnAdd();

                    b.Property<int>("DocumentFolderId");

                    b.Property<string>("Name")
                        .IsRequired();

                    b.Property<string>("Path")
                        .IsRequired();

                    b.Property<decimal>("Weight");

                    b.HasKey("DocumentId");

                    b.HasIndex("DocumentFolderId");

                    b.ToTable("Documents");
                });

            modelBuilder.Entity("BibleNote.Analytics.Data.Entities.DocumentFolder", b =>
                {
                    b.Property<int>("DocumentFolderId")
                        .ValueGeneratedOnAdd();

                    b.Property<string>("Name")
                        .IsRequired();

                    b.Property<string>("NavigationProviderName")
                        .IsRequired();

                    b.Property<int?>("ParentFolderId");

                    b.Property<string>("Path")
                        .IsRequired();

                    b.HasKey("DocumentFolderId");

                    b.HasIndex("ParentFolderId");

                    b.ToTable("DocumentFolders");
                });

            modelBuilder.Entity("BibleNote.Analytics.Data.Entities.DocumentParagraph", b =>
                {
                    b.Property<int>("DocumentParagraphId")
                        .ValueGeneratedOnAdd();

                    b.Property<int>("DocumentId");

                    b.Property<int?>("DocumentId1");

                    b.Property<int>("Index");

                    b.Property<string>("Path");

                    b.HasKey("DocumentParagraphId");

                    b.HasIndex("DocumentId");

                    b.HasIndex("DocumentId1");

                    b.ToTable("DocumentParagraphs");
                });

            modelBuilder.Entity("BibleNote.Analytics.Data.Entities.VerseEntry", b =>
                {
                    b.Property<int>("VerseEntryId")
                        .ValueGeneratedOnAdd();

                    b.Property<int>("DocumentParagraphId");

                    b.Property<string>("Suffix");

                    b.Property<long>("VerseId");

                    b.Property<decimal>("Weight");

                    b.HasKey("VerseEntryId");

                    b.HasIndex("DocumentParagraphId");

                    b.ToTable("VerseEntries");
                });

            modelBuilder.Entity("BibleNote.Analytics.Data.Entities.VerseRelation", b =>
                {
                    b.Property<int>("VerseRelationId")
                        .ValueGeneratedOnAdd();

                    b.Property<int>("DocumentParagraphId");

                    b.Property<decimal>("RelationWeight");

                    b.Property<int?>("RelativeDocumentParagraphId");

                    b.Property<long>("RelativeVerseId");

                    b.Property<long>("VerseId");

                    b.HasKey("VerseRelationId");

                    b.HasIndex("DocumentParagraphId");

                    b.HasIndex("RelativeDocumentParagraphId");

                    b.HasIndex("RelativeVerseId");

                    b.HasIndex("VerseId");

                    b.ToTable("VerseRelations");
                });

            modelBuilder.Entity("BibleNote.Analytics.Data.Entities.Document", b =>
                {
                    b.HasOne("BibleNote.Analytics.Data.Entities.DocumentFolder", "Folder")
                        .WithMany()
                        .HasForeignKey("DocumentFolderId")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("BibleNote.Analytics.Data.Entities.DocumentFolder", b =>
                {
                    b.HasOne("BibleNote.Analytics.Data.Entities.DocumentFolder", "ParentFolder")
                        .WithMany()
                        .HasForeignKey("ParentFolderId")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("BibleNote.Analytics.Data.Entities.DocumentParagraph", b =>
                {
                    b.HasOne("BibleNote.Analytics.Data.Entities.Document", "Document")
                        .WithMany()
                        .HasForeignKey("DocumentId")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("BibleNote.Analytics.Data.Entities.Document")
                        .WithMany("Paragraphs")
                        .HasForeignKey("DocumentId1");
                });

            modelBuilder.Entity("BibleNote.Analytics.Data.Entities.VerseEntry", b =>
                {
                    b.HasOne("BibleNote.Analytics.Data.Entities.DocumentParagraph", "DocumentParagraph")
                        .WithMany()
                        .HasForeignKey("DocumentParagraphId")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("BibleNote.Analytics.Data.Entities.VerseRelation", b =>
                {
                    b.HasOne("BibleNote.Analytics.Data.Entities.DocumentParagraph", "DocumentParagraph")
                        .WithMany()
                        .HasForeignKey("DocumentParagraphId")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("BibleNote.Analytics.Data.Entities.DocumentParagraph", "RelativeDocumentParagraph")
                        .WithMany()
                        .HasForeignKey("RelativeDocumentParagraphId")
                        .OnDelete(DeleteBehavior.Restrict);
                });
#pragma warning restore 612, 618
        }
    }
}
