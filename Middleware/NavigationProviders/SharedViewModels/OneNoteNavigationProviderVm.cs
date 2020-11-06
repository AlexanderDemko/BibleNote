using AutoMapper;
using BibleNote.Domain.Entities;
using BibleNote.Infrastructure.AutoMapper;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using BibleNote.Services.NavigationProvider;

namespace BibleNote.Middleware.NavigationProviders.SharedViewModels
{
    public class OneNoteNavigationProviderVm : NavigationProviderVm, IHaveCustomMapping
    {
        public OneNoteNavigationProviderParameters Parameters { get; set; }

        public override void CreateMappings(Profile configuration)
        {
            configuration.CreateMap<OneNoteNavigationProviderVm, NavigationProviderInfo>()
                .ForMember(d => d.ParametersRaw, s => s.MapFrom(v => v.Parameters.GetParametersRaw()));

            configuration.CreateMap<NavigationProviderInfo, OneNoteNavigationProviderVm>()
                .ForMember(
                    d => d.Parameters,
                    s => s.MapFrom(v => NavigationProviderParametersBase.ReadParameters<OneNoteNavigationProviderParameters>(v.ParametersRaw)));
        }
    }
}
