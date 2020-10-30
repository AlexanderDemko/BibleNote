using BibleNote.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BibleNote.Persistence.Configurations
{
    class NavigationProviderInfoConfiguration : IEntityTypeConfiguration<NavigationProviderInfo>
    {
        public void Configure(EntityTypeBuilder<NavigationProviderInfo> builder)
        {
            builder.ToTable(nameof(AnalyticsDbContext.NavigationProvidersInfo));

            builder.Property(d => d.Name).IsRequired(true);
            builder.Property(d => d.Type).IsRequired(true);
            builder.Property(d => d.IsReadonly).IsRequired(true);
            builder.Property(d => d.ParametersRaw).IsRequired(true);
        }
    }
}
