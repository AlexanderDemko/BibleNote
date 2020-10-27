using System.Collections.Generic;
using System.Threading.Tasks;
using BibleNote.Middleware.NavigationProviders.Queries.List;
using Microsoft.AspNetCore.Mvc;

namespace BibleNote.Application.Controllers
{
    public class NavigationProvidersController : BaseController
    {
        [HttpGet]
        public async Task<List<NavigationProviderVm>> GetTop()
        {
            var data = await Mediator.Send(new Middleware.NavigationProviders.Queries.List.Request());
            return data;
        }
    }
}
