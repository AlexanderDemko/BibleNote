using MediatR;
using System.Collections.Generic;

namespace BibleNote.UI.Middleware.NavigationProviders.Queries.List
{
    public class Request : IRequest<List<NavigationProviderVm>>
    {
    }
}
