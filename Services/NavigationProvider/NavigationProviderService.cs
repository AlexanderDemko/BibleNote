using System.Collections.Generic;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Services.NavigationProvider.Contracts;

namespace BibleNote.Services.NavigationProvider
{
    class NavigationProviderService : INavigationProviderService
    {
        private readonly ITrackingDbContext analyticsContext;

        public NavigationProviderService(ITrackingDbContext analyticsContext)
        {
            this.analyticsContext = analyticsContext;
        }

        public Task<IList<NavigationProviderInfo>> GetNavigationProvidersInfoAsync()
        {
            return this.analyticsContext.NavigationProvidersInfo.ToListAsync();
        }

        public Task SaveNavigationProvidersInfoAsync(List<NavigationProviderInfo> navigationProviderInfos)
        {
            return this.analyticsContext.SaveChangesAsync();
        }
    }
}
