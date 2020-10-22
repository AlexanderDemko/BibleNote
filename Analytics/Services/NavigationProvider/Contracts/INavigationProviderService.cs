using BibleNote.Analytics.Domain.Entities;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.NavigationProvider.Contracts
{
    public interface INavigationProviderService
    {
        Task<IList<NavigationProviderInfo>> GetNavigationProvidersInfoAsync();

        Task SaveNavigationProvidersInfoAsync(List<NavigationProviderInfo> navigationProviderInfos);
    }
}
