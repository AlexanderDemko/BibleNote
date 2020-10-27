﻿using BibleNote.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BibleNote.Persistence.Configurations
{
    class DocumentConfiguDocumentFolderConfigurationration : IEntityTypeConfiguration<DocumentFolder>
    {
        public void Configure(EntityTypeBuilder<DocumentFolder> builder)
        {
            builder.ToTable(nameof(AnalyticsDbContext.DocumentFolders));

            builder.Property(f => f.Name).IsRequired(true);
            builder.Property(f => f.Path).IsRequired(true);
            builder.Property(f => f.NavigationProviderName).IsRequired(true);

            builder.HasIndex(f => new { f.NavigationProviderName, f.Path }).IsUnique(true);
        }
    }
}
