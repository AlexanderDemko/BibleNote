using BibleNote.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BibleNote.Persistence.Configurations
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
