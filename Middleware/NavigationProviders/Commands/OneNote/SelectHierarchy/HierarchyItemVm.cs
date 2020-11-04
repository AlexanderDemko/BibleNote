using BibleNote.Infrastructure.AutoMapper;
using BibleNote.Providers.OneNote.Services.NavigationProvider.Models;

namespace BibleNote.Middleware.NavigationProviders.Commands.OneNote.SelectHierarchy
{
    public class HierarchyItemVm: IMapFrom<OneNoteHierarchyInfo>
    {
        public string Id { get; set; }

        public string Name { get; set; }

        public OneNoteHierarchyType Type { get; set; }
    }
}
