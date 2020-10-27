using System.Collections.Generic;
using System.Threading.Tasks;
using BibleNote.Domain.Entities;

namespace BibleNote.Services.NavigationProvider.Contracts
{
    public interface INavigationProviderService
    {
        Task<IList<NavigationProviderInfo>> GetNavigationProvidersInfoAsync();

        Task SaveNavigationProvidersInfoAsync(List<NavigationProviderInfo> navigationProviderInfos);
    }
}
