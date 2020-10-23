using MediatR;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.UI.Middleware.NavigationProviders.Queries.List
{
    public class Handler : IRequestHandler<Request, List<NavigationProviderVm>>
    {
        public async Task<List<NavigationProviderVm>> Handle(Request request, CancellationToken cancellationToken)
        {

            var result = new List<NavigationProviderVm>()
            {
                new NavigationProviderVm() { Name = "Test1" }
            };

            return result;
        }
    }
}
