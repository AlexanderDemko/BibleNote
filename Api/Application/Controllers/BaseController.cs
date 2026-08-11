using Microsoft.AspNetCore.Mvc;

namespace BibleNote.Application.Controllers
{
    [ApiController]
    [Route("api/[controller]/[action]")]
    public abstract class BaseController : ControllerBase
    {
    }
}
