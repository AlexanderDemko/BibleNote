using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using BibleNote.Analytics.Domain.Entities;

namespace BibleNote.Analytics.Persistence.Configurations
{
    class DocumentParagraphConfiguration : IEntityTypeConfiguration<DocumentParagraph>
    {
        public void Configure(EntityTypeBuilder<DocumentParagraph> builder)
        {
            builder.ToTable(nameof(AnalyticsContext.DocumentParagraphs));      
        }
    }
}
