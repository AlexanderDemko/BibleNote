using BibleNote.Middleware.NavigationProviders.SharedViewModels;
using MediatR;

namespace BibleNote.Middleware.NavigationProviders.Queries.OneNote.Read
{
    public class Request: IRequest<OneNoteNavigationProviderVm>
    {
        public int NavigationProviderId { get; set; }

        public Request(int navigationProviderId)
        {
            NavigationProviderId = navigationProviderId;
        }
    }
}
