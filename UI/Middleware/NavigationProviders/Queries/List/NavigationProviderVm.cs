using BibleNote.Analytics.Domain.Entities;
using BibleNote.UI.Infrastructure.AutoMapper;

namespace BibleNote.UI.Middleware.NavigationProviders.Queries.List
{
    public class NavigationProviderVm: IMapFrom<NavigationProviderInfo>
    {
        public int Id { get; set; }

        public string Name { get; set; }

        public string Description { get; set; }
    }
}
