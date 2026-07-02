using AutoMapper;
using BibleNote.Infrastructure.AutoMapper;
using BibleNote.Providers.OneNote.Services.Models;

namespace BibleNote.Middleware.NavigationProviders.SharedViewModels
{
    public class HierarchyItemVm : IHaveCustomMapping
    {
        public string Id { get; set; }

        public string Name { get; set; }

        public OneNoteHierarchyType Type { get; set; }

        public void CreateMappings(Profile configuration)
        {
            configuration.CreateMap<HierarchyItemVm, OneNoteHierarchyInfo>().ReverseMap();
        }
    }
}
