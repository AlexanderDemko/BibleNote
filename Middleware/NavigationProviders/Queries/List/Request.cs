using System.Collections.Generic;
using MediatR;

namespace BibleNote.Middleware.NavigationProviders.Queries.List
{
    public class Request : IRequest<List<NavigationProviderVm>>
    {
    }
}
