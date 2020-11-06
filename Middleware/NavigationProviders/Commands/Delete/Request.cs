using MediatR;

namespace BibleNote.Middleware.NavigationProviders.Commands.Delete
{
    public class Request : IRequest
    {
        public int NavigationProviderId { get; set; }

        public Request(int navigationProviderId)
        {
            NavigationProviderId = navigationProviderId;
        }
    }
}
