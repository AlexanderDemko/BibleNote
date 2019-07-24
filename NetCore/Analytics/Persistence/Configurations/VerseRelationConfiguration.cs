﻿using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using BibleNote.Analytics.Data.Entities;

namespace BibleNote.Analytics.Persistence.Configurations
{
    class VerseRelationConfiguration : IEntityTypeConfiguration<VerseRelation>
    {
        public void Configure(EntityTypeBuilder<VerseRelation> builder)
        {
            builder.ToTable(nameof(AnalyticsContext.VerseRelations));

            builder.HasIndex(v => v.VerseId);
            builder.HasIndex(v => v.RelativeVerseId);
            
            builder
                .HasOne(v => v.DocumentParagraph)
                .WithMany()
                .HasForeignKey(v => v.DocumentParagraphId)
                .OnDelete(DeleteBehavior.Restrict);

            builder
                .HasOne(v => v.RelativeDocumentParagraph)
                .WithMany()
                .HasForeignKey(v => v.RelativeDocumentParagraphId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
