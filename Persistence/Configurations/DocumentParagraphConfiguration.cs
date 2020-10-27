using BibleNote.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BibleNote.Persistence.Configurations
{
    class DocumentParagraphConfiguration : IEntityTypeConfiguration<DocumentParagraph>
    {
        public void Configure(EntityTypeBuilder<DocumentParagraph> builder)
        {
            builder.ToTable(nameof(AnalyticsDbContext.DocumentParagraphs));      
        }
    }
}
