using BibleNote.Middleware.NavigationProviders.SharedViewModels;
using MediatR;

namespace BibleNote.Middleware.NavigationProviders.Commands.OneNote.Create
{
    public class Request : IRequest<int>
    {
        public OneNoteNavigationProviderVm NavigationProvider { get; set; }

        public Request(OneNoteNavigationProviderVm navigationProvider)
        {
            NavigationProvider = navigationProvider;
        }
    }
}
