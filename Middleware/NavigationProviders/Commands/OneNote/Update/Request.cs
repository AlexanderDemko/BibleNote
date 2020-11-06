using BibleNote.Middleware.NavigationProviders.SharedViewModels;
using MediatR;

namespace BibleNote.Middleware.NavigationProviders.Commands.OneNote.Update
{
    public class Request: IRequest
    {
        public OneNoteNavigationProviderVm NavigationProvider { get; set; }

        public Request(OneNoteNavigationProviderVm navigationProvider)
        {
            NavigationProvider = navigationProvider;
        }
    }
}
