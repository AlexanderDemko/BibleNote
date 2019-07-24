using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using BibleNote.Analytics.Data.Entities;

namespace BibleNote.Analytics.Persistence.Configurations
{
    class DocumentParagraphConfiguration : IEntityTypeConfiguration<DocumentParagraph>
    {
        public void Configure(EntityTypeBuilder<DocumentParagraph> builder)
        {
            builder.ToTable(nameof(AnalyticsContext.DocumentParagraphs));

            builder
                .HasOne(d => d.Document)
                .WithMany()
                .HasForeignKey(d => d.DocumentId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
