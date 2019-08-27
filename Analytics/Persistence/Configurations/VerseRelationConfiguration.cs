using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using BibleNote.Analytics.Domain.Entities;

namespace BibleNote.Analytics.Persistence.Configurations
{
    class VerseRelationConfiguration : IEntityTypeConfiguration<VerseRelation>
    {
        public void Configure(EntityTypeBuilder<VerseRelation> builder)
        {
            builder.ToTable(nameof(AnalyticsContext.VerseRelations));

            builder.HasIndex(v => v.VerseId);
            builder.HasIndex(v => v.RelativeVerseId);
        }
    }
}
