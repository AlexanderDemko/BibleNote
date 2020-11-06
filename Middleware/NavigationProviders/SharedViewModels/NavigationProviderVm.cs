using AutoMapper;
using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Infrastructure.AutoMapper;

namespace BibleNote.Middleware.NavigationProviders.SharedViewModels
{
    public class NavigationProviderVm : IHaveCustomMapping
    {
        public int Id { get; set; }

        public string Name { get; set; }

        public string Description { get; set; }

        public bool IsReadonly { get; set; }

        public NavigationProviderType Type { get; set; }

        public virtual void CreateMappings(Profile configuration)
        {
            configuration.CreateMap<NavigationProviderVm, NavigationProviderInfo>()
                .ForMember(d => d.ParametersRaw, s => s.Ignore());

            configuration.CreateMap<NavigationProviderInfo, NavigationProviderVm>();
        }
    }
}
