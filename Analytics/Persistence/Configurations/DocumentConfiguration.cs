using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using BibleNote.Analytics.Domain.Entities;

namespace BibleNote.Analytics.Persistence.Configurations
{
    class DocumentConfiguration : IEntityTypeConfiguration<Document>
    {
        public void Configure(EntityTypeBuilder<Document> builder)
        {
            builder.ToTable(nameof(AnalyticsDbContext.Documents));

            builder.Property(d => d.Name).IsRequired(true);
            builder.Property(d => d.Path).IsRequired(true);                        
        }
    }
}
