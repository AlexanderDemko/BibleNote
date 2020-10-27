using BibleNote.Domain.Entities;
using BibleNote.Infrastructure.AutoMapper;

namespace BibleNote.Middleware.NavigationProviders.Queries.List
{
    public class NavigationProviderVm: IMapFrom<NavigationProviderInfo>
    {
        public int Id { get; set; }

        public string Name { get; set; }

        public string Description { get; set; }
    }
}
