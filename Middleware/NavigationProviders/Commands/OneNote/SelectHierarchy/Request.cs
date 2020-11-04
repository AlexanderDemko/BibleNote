using MediatR;
using System.Collections.Generic;


namespace BibleNote.Middleware.NavigationProviders.Commands.OneNote.SelectHierarchy
{
    public class Request : IRequest<List<HierarchyItemVm>>
    {
    }
}
