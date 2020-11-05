using BibleNote.Domain.Entities;
using BibleNote.Middleware.NavigationProviders.SharedViewModels;
using MediatR;
using System.Collections.Generic;

namespace BibleNote.Middleware.NavigationProviders.Queries.OneNote.Create
{
    public class Request: IRequest<int>
    {
        public NavigationProviderVm NavigationProvider { get; set; }

        public List<HierarchyItemVm> HierarchyItems { get; set; }
    }
}
