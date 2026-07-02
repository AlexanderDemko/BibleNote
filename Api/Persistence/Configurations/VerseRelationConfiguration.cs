using BibleNote.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BibleNote.Persistence.Configurations
{
    class VerseRelationConfiguration : IEntityTypeConfiguration<VerseRelation>
    {
        public void Configure(EntityTypeBuilder<VerseRelation> builder)
        {
            builder.ToTable(nameof(AnalyticsDbContext.VerseRelations));

            builder.HasIndex(v => v.VerseId);
            builder.HasIndex(v => v.RelativeVerseId);
        }
    }
}
