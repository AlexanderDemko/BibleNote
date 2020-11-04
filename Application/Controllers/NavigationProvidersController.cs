using System.Collections.Generic;
using System.Threading.Tasks;
using BibleNote.Middleware.NavigationProviders.Queries.List;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using Microsoft.AspNetCore.Mvc;

namespace BibleNote.Application.Controllers
{
    public class NavigationProvidersController : BaseController
    {
        [HttpGet]
        public async Task<List<NavigationProviderVm>> GetAllAsync()
        {
            var data = await Mediator.Send(new Middleware.NavigationProviders.Queries.List.Request());
            return data;
        }

        //[HttpPost]
        //public async Task<NavigationProviderVm> CreateOneNoteProviderAsync(NavigationProviderVm info, OneNoteNavigationProviderParameters parameters)
        //{
        //    return null;
        //}

        [HttpGet]
        public async Task CallHierarchyItemsSelectionDialog()
        {
            await Mediator.Send(new Middleware.NavigationProviders.Commands.OneNote.SelectHierarchy.Request());
        }
    }
}
