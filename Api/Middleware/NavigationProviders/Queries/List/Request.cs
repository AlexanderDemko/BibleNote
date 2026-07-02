using System.Collections.Generic;
using BibleNote.Middleware.NavigationProviders.SharedViewModels;
using MediatR;

namespace BibleNote.Middleware.NavigationProviders.Queries.List
{
    public class Request : IRequest<List<NavigationProviderVm>>
    {
    }
}
