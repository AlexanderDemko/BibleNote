using BibleNote.Analytics.Domain.Contracts;
using BibleNote.Analytics.Domain.Entities;
using BibleNote.Analytics.Services.NavigationProvider.Contracts;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.NavigationProvider
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
