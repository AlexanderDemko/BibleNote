using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using BibleNote.Analytics.Data.Entities;

namespace BibleNote.Analytics.Persistence.Configurations
{
    class VerseEntryConfiguration : IEntityTypeConfiguration<VerseEntry>
    {
        public void Configure(EntityTypeBuilder<VerseEntry> builder)
        {
            builder.ToTable(nameof(AnalyticsContext.VerseEntries));

            builder.Property(v => v.VerseId).IsRequired(true);            

            builder
                .HasOne(v => v.DocumentParagraph)
                .WithMany()
                .HasForeignKey(v => v.DocumentParagraphId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
