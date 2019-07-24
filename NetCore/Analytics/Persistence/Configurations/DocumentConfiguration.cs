using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using BibleNote.Analytics.Data.Entities;

namespace BibleNote.Analytics.Persistence.Configurations
{
    class DocumentConfiguration : IEntityTypeConfiguration<Document>
    {
        public void Configure(EntityTypeBuilder<Document> builder)
        {
            builder.ToTable(nameof(AnalyticsContext.Documents));

            builder.Property(d => d.Name).IsRequired(true);
            builder.Property(d => d.Path).IsRequired(true);            

            builder
                .HasOne(d => d.Folder)
                .WithMany()
                .HasForeignKey(d => d.DocumentFolderId)
                .OnDelete(DeleteBehavior.Restrict);
        }
    }
}
