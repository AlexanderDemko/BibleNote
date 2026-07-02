using BibleNote.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BibleNote.Persistence.Configurations
{
    class VerseEntryConfiguration : IEntityTypeConfiguration<VerseEntry>
    {
        public void Configure(EntityTypeBuilder<VerseEntry> builder)
        {
            builder.ToTable(nameof(AnalyticsDbContext.VerseEntries));

            builder.Property(v => v.VerseId).IsRequired(true);            
        }
    }
}
