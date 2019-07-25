using Microsoft.EntityFrameworkCore;
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
                .HasOne(v => v.Verse)
                .WithMany()
                .HasForeignKey(v => v.VerseId)
                .OnDelete(DeleteBehavior.Restrict);

            builder
                .HasOne(v => v.RelativeVerse)
                .WithMany()
                .HasForeignKey(v => v.RelativeVerseId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
