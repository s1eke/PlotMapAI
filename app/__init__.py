"""Flask application factory."""
from pathlib import Path

from flask import Flask
from flask_cors import CORS

from config import Config


def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__)
    app.config.from_object(Config)
    app.config["MAX_CONTENT_LENGTH"] = Config.MAX_CONTENT_LENGTH

    # CORS for frontend dev server
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Ensure upload directory exists
    upload_dir = Path(Config.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / "covers").mkdir(exist_ok=True)
    (upload_dir / "epubs").mkdir(exist_ok=True)

    # Initialize database
    from database import init_db
    from services.analysis_runner import recover_interrupted_jobs

    init_db()
    recover_interrupted_jobs()

    # Register blueprints
    from routes.analysis import analysis_bp
    from routes.novels import novels_bp
    from routes.reader import reader_bp
    from routes.settings import settings_bp

    app.register_blueprint(novels_bp, url_prefix="/api")
    app.register_blueprint(reader_bp, url_prefix="/api")
    app.register_blueprint(analysis_bp, url_prefix="/api")
    app.register_blueprint(settings_bp, url_prefix="/api/settings")

    # Serve frontend static files in production
    frontend_dist = Path(__file__).parent / "frontend" / "dist"
    if frontend_dist.exists():
        from flask import send_from_directory

        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def serve_frontend(path):
            file_path = frontend_dist / path
            if path and file_path.exists():
                return send_from_directory(str(frontend_dist), path)
            return send_from_directory(str(frontend_dist), "index.html")

    return app
