using BibleNote.Analytics.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BibleNote.Analytics.Persistence.Configurations
{
    class DocumentConfiguDocumentFolderConfigurationration : IEntityTypeConfiguration<DocumentFolder>
    {
        public void Configure(EntityTypeBuilder<DocumentFolder> builder)
        {
            builder.ToTable(nameof(AnalyticsContext.DocumentFolders));

            builder.Property(f => f.Name).IsRequired(true);
            builder.Property(f => f.Path).IsRequired(true);
            builder.Property(f => f.NavigationProviderName).IsRequired(true);
        }
    }
}
